odoo.define('hotel_reservation_dashboard.dsm', function (require) {
    "use strict";
    var AbstractAction = require('web.AbstractAction');
    var core = require('web.core');
    var QWeb = core.qweb;
    var rpc = require('web.rpc');
    var ajax = require('web.ajax');
    var _t = core._t;
    var rooms_name = [];
    const { loadBundle } = require("@web/core/assets");
    var session = require('web.session');
    var ReservationDashBoard = AbstractAction.extend({
        template: 'ReservationDashBoard',
        events: {
            'click .date-cell': 'toggleCellSelection',
            'change #month': 'DateChangeTriggerTable',
            'click #datetimes': 'Datepicker',
        },

        init: function (parent, context) {
            this._super(parent, context);
            this.selectedStartDate = null;
            this.selectedEndDate = null;
            this.selectedStartRow = null;
            this.selectedEndRow = null;
        },

        willStart: function () {
            var self = this;
            return this._super().then(function () {
                self.currentMonth = new Date().getMonth() + 1;
                self.currentYear = new Date().getFullYear();

                return self.loadMonthDates(self.currentYear, self.currentMonth).then(function (dates) {
                    self.month_dates = dates;
                }).then(function () {
                    return self._rpc({
                        model: "room.booking",
                        method: "get_rooms_details_query",
                    }).then(function (res) {
                        self.result = res;
                    });
                });
            });
        },

        loadMonthDates: function (year, month) {
            return this._rpc({
                model: "room.booking",
                method: "get_month_dates",
                args: [year, month],
            });
        },

        loadMonthDatesForRange: function (startDate, endDate) {
            return this._rpc({
                model: "room.booking",
                method: "get_month_dates_for_range",
                args: [startDate, endDate],
            });
        },

        start: function () {
            var self = this;
            this.set("title", 'Room Booking');
            return this._super().then(function () {
//                self.Datepicker();
                self.trigger_table();

                self.$('.RoomTrackTable').on('click', '.customer-tag', function (event) {
                    var bookingId = $(event.currentTarget).data('booking-id');
                    self.openBookingWizard(bookingId);
                });
            });
        },


        check_access_product: function (group) {
            return session.user_has_group(group);
        },


        openBookingWizard: function (bookingId) {
            var self = this;

            self._rpc({
                model: 'room.booking',
                method: 'search_read',
                domain: [['id', '=', bookingId]],
            }).then(function (booking) {
                 var group = "hotel_reservation_dashboard.booking_edit_dashboard_access";
                if (booking.length > 0) {
                    session.user_has_group(group).then(function (hasGroup) {
                        if (!hasGroup) {
                                self.do_action({
                                    type: 'ir.actions.act_window',
                                    res_model: 'room.booking',
                                    res_id: booking[0].id,
                                    views: [[false, 'form']],
                                    target: 'new',
                                    context: { 'create': false },
                                    flags: {
                                        mode: 'readonly',
                                        action_buttons: false,
                                    }
                                });
                            } else {
                                    self.do_action({
                                    type: 'ir.actions.act_window',
                                    res_model: 'room.booking',
                                    res_id: booking[0].id,
                                    views: [[false, 'form']],
                                    target: 'new',
                                });
                            }
                    }).catch(function (error) {
                        console.error("Error checking access:", error);
                    });

                } else {
                    self.displayNotification({
                        title: _t('Error'),
                        message: _t('Booking not found!'),
                        type: 'danger',
                    });
                }
            });
        },


        DateChangeTriggerTable: function (startDate = null, endDate = null) {
            var self = this;

            if (startDate && endDate) {
                console.log("Selected Date Range:", startDate, "to", endDate);

                self.loadMonthDatesForRange(startDate, endDate).then(function (dates) {
                    self.month_dates = dates;
                    self.trigger_table();
                });
            } else {
                var monthValue = this.$('#month').val();

                if (monthValue) {
                    console.log("Selected month value:", monthValue);
                    var [year, month] = monthValue.split('-').map(Number);

                    self.currentYear = year;
                    self.currentMonth = month;

                    self.loadMonthDates(year, month).then(function (dates) {
                        self.month_dates = dates;
                        self.trigger_table();
                    });
                } else {
                    console.error("Month value is invalid!");
                }
            }
        },

        destroy: function () {
            this.$('input[name="datetimes"]').data('daterangepicker')?.remove();
            return this._super();
        },

        Datepicker: function () {
            if (typeof $.fn.daterangepicker === "undefined") {
                console.error("Date Range Picker plugin not loaded!");
                return;
            }

            var self = this;
            var $input = this.$('input[name="datetimes"]');

            $input.daterangepicker({
                timePicker: true,
                timePicker24Hour: true,
                startDate: moment().startOf('hour'),
                endDate: moment().startOf('hour').add(32, 'hour'),
                locale: {
                    format: 'MM/DD/YYYY hh:mm A'
                },
                autoApply: false,
                autoClose: false,
                opens: 'right',
            });

            $input.on('apply.daterangepicker', function (ev, picker) {
                var startDate = picker.startDate.format('YYYY-MM-DD');
                var endDate = picker.endDate.format('YYYY-MM-DD');
                self.DateChangeTriggerTable(startDate, endDate);
                setTimeout(function () {
                    $input.data('daterangepicker').hide();
                }, 100);
            });
            $input.on('click', function (ev) {
                if (!$(ev.target).data('daterangepicker')) {
                    $input.data('daterangepicker').show();
                }
            });

            setTimeout(function () {
                $input.data('daterangepicker').show();
            }, 0);
        },


        trigger_table: function () {
            var self = this;
            var container = self.$('.RoomTrackTable');
            container.empty();

            container.append(`
                <table class="table table-bordered">
                    <thead>
                        <tr>
                            <th>Room Name</th>
                            ${self.month_dates.map(date => `<th>${date}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${self.generateRows()}
                    </tbody>
                </table>
            `);
        },

        generateRows: function () {
            var self = this;
            var rows = '';

            self.result.forEach((roomData, rowIndex) => {
                const roomName = roomData.room_name.en_US;
                const bookings = roomData.customer_bookings;

                rows += `<tr class="product-row" data-row-index="${rowIndex}">
                    <td>${roomName}</td>`;

                let dateIndex = 0;
                while (dateIndex < self.month_dates.length) {
                    const date = self.month_dates[dateIndex];
                    let bookingInfo = bookings.find(booking => booking.booking_dates.includes(date));

                    if (bookingInfo) {
                        let spanCount = 1;
                        while (
                            dateIndex + spanCount < self.month_dates.length &&
                            bookingInfo.booking_dates.includes(self.month_dates[dateIndex + spanCount])
                        ) {
                            spanCount++;
                        }

                        rows += `<td class="date-cell booked" data-date="${date}" colspan="${spanCount}"
                                     style="background-color: #c92c2c; color: white; font-weight: bold; text-align: center; position: relative;">
                                     <div class="customer-tag" data-booking-id="${bookingInfo.booking_id}"
                                          style="cursor: pointer; text-decoration: underline;">
                                          ${bookingInfo.customer_name}
                                     </div>
                                 </td>`;

                        dateIndex += spanCount;
                    } else {
                        rows += `<td class="date-cell available" data-date="${date}"
                                     style="background-color: #4caf50; color: white; font-weight: bold; text-align: center;">
                                     Available
                                 </td>`;
                        dateIndex++;
                    }
                }

                rows += `</tr>`;
            });

            return rows;
        },


       toggleCellSelection: function (event) {
    var self = this;
    var $cell = $(event.currentTarget);
    var date = $cell.attr('data-date');
    var rowIndex = $cell.closest('tr').data('row-index');
    var isBooked = $cell.hasClass('booked');

    if (isBooked) {
        var roomData = self.result[rowIndex];
        var bookingDetails = roomData.customer_bookings.find(booking => booking.booking_dates.includes(date));

        if (bookingDetails) {
            var bookingId = bookingDetails.booking_id;

            self._rpc({
                model: 'room.booking',
                method: 'search_read',
                domain: [['id', '=', bookingId]],
            }).then(function (booking) {
                if (booking.length > 0) {
                    self.do_action({
                        type: 'ir.actions.act_window',
                        res_model: 'room.booking',
                        res_id: booking[0].id,
                        views: [[false, 'form']],
                        target: 'new',
                    });
                } else {
                    self.displayNotification({
                        title: _t('Error'),
                        message: _t('Booking not found!'),
                        type: 'danger',
                    });
                }
            });
        }
    } else {
        if (!self.selectedStartDate) {
            self.selectedStartDate = new Date(date);
            self.selectedStartRow = rowIndex;
            $cell.addClass('selected-start');
        } else if (!self.selectedEndDate) {
            self.selectedEndDate = new Date(date);
            self.selectedEndRow = rowIndex;
            $cell.addClass('selected-end');

            console.log('Selected Date Range:', self.selectedStartDate, self.selectedEndDate);

            self.highlightDateRange();
            self.openRoomBookingWizard(rowIndex);
        } else {
            self.resetSelection();
        }
    }
},




//       openBookingWizard: function (bookingId) {
//            var self = this;
//
//            self._rpc({
//                model: 'room.booking',
//                method: 'search_read',
//                domain: [['id', '=', bookingId]],
//            }).then(function (booking) {
//                var group = "hotel_reservation_dashboard.booking_edit_dashboard_access";
//                if (booking.length > 0) {
//                    this.check_access_product(group).then(function (hasGroup) {
//                    if (!hasGroup) {
//                            self.do_action({
//                                type: 'ir.actions.act_window',
//                                res_model: 'room.booking',
//                                res_id: booking[0].id,
//                                views: [[false, 'form']],
//                                target: 'new',
//                                context: { 'create': false },
//                                flags: {
//                                    mode: 'readonly',
//                                    action_buttons: false,
//                                }
//                            });
//                        } else {
//                            self.do_action({
//                            type: 'ir.actions.act_window',
//                            res_model: 'room.booking',
//                            res_id: booking[0].id,
//                            views: [[false, 'form']],
//                            target: 'new',
//                        });
//                        }
//                    }).catch(function (error) {
//                        console.error("Error checking access:", error);
//                    });
//                } else {
//                    self.displayNotification({
//                        title: _t('Error'),
//                        message: _t('Booking not found!'),
//                        type: 'danger',
//                    });
//                }
//            });
//        },


        openRoomBookingWizard: function (rowIndex) {
            var self = this;
            var checkinDate = new Date(self.selectedStartDate);
            var checkoutDate = new Date(self.selectedEndDate);
            if (checkoutDate < checkinDate) {
                alert("Checkout date must be the same as or later than the check-in date.\n\nPlease select the table cells correctly:\n- First click: Check-in date\n- Second click: Check-out date");
                return;
            }
            var checkinDate = self.selectedStartDate.toISOString().split('T')[0];
            var checkoutDate = self.selectedEndDate.toISOString().split('T')[0];

            console.log("rooms_name", rooms_name);

            self._rpc({
                model: 'hotel.room',
                method: 'search',
                args: [[['name', 'in', rooms_name]]]
            }).then(function (rooms) {
                console.log("Rooms found:", rooms);

                if (rooms.length > 0) {
                    var roomLineData = rooms.map(function (room) {
                         console.log("Roomsssssssssss:", room);
                         var checkin = new Date(checkinDate);
                            var checkout = new Date(checkoutDate);
                            var diffTime = checkout - checkin;
                            var diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                            if (diffTime > 0) {
                                diffDays += 1;
                            }
                         return [
                            0, 0, {
                                'room_id': room,
                                'checkin_date': checkinDate,
                                'checkout_date': checkoutDate,
                                'uom_qty': diffDays
                            }
                        ];
                    });

                    console.log("Room Line Data:", roomLineData);

                    self.do_action({
                        type: 'ir.actions.act_window',
                        res_model: 'room.booking',
                        views: [[false, 'form']],
                        context: { 'default_room_line_ids': roomLineData },
                        target: 'new',
                    });
                } else {
                    self.displayNotification({
                        message: "Room not found!",
                        type: 'warning',
                        title: 'Room Not Found'
                    });
                }
            });
        },

        highlightDateRange: function () {
            var self = this;

            if (!self.selectedStartDate || !self.selectedEndDate) return;
            rooms_name = [];
            var startDate = self.selectedStartDate;
            var endDate = self.selectedEndDate;

            if (startDate > endDate) {
                [startDate, endDate] = [endDate, startDate];
            }

            var startRow = Math.min(self.selectedStartRow, self.selectedEndRow);
            var endRow = Math.max(self.selectedStartRow, self.selectedEndRow);

            for (var rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
                var productName = self.$(`.product-row[data-row-index="${rowIndex}"] td:first-child`).text();
                var roomBookings = self.result[rowIndex].customer_bookings;

                var isRoomAvailable = true;

                for (var booking of roomBookings) {
                    var bookingDates = booking.booking_dates;
                    var hasBookingInRange = bookingDates.some(function (date) {
                        var cellDate = new Date(date);
                        return cellDate >= startDate && cellDate <= endDate;
                    });

                    if (hasBookingInRange) {
                        isRoomAvailable = false;
                        break;
                    }
                }
                if (isRoomAvailable) {
                    rooms_name.push(productName);
                    console.log(`Selected Product: ${productName}`);
                } else {
                    console.log(`Room ${productName} is not available in the selected date range.`);
                }
                self.$(`.date-cell[data-row-index="${rowIndex}"]`).each(function () {
                    var cellDate = new Date($(this).data('date'));
                    if (cellDate >= startDate && cellDate <= endDate) {
                        $(this).addClass('selected-range');
                    }
                });
            }
        },

        resetSelection: function () {
            var self = this;
            self.selectedStartDate = null;
            self.selectedEndDate = null;
            self.selectedStartRow = null;
            self.selectedEndRow = null;
            self.$('.date-cell').removeClass('selected-start selected-end selected-range');
        }
    });

    core.action_registry.add('Reservationdashboard_tags', ReservationDashBoard);
    return ReservationDashBoard;
});


