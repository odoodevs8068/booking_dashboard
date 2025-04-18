from odoo import api,fields, models, _
from datetime import datetime, timedelta
from odoo.exceptions import ValidationError


class HotelRoomInherit(models.Model):
    _inherit = 'hotel.room'

    currency_id = fields.Many2one('res.currency', default= lambda self: self.env.company.currency_id)


class RoomBookinglineInherit(models.Model):
    _inherit = 'room.booking.line'

    status = fields.Selection(related='booking_id.state', string="booking status")

    @api.onchange("checkin_date", "checkout_date")
    def _onchange_checkin_date(self):
        if self.room_id:
            overlapping_bookings = self.env["room.booking.line"].search([
                ('room_id', '=', self.room_id.id),
                '|',
                '&', ('checkin_date', '<=', self.checkin_date), ('checkout_date', '>=', self.checkin_date),
                '&', ('checkin_date', '<=', self.checkout_date), ('checkout_date', '>=', self.checkout_date),
            ])

            if overlapping_bookings:
                next_available_date = max(overlapping_bookings.mapped('checkout_date')) + timedelta(days=1)
                raise ValidationError(_(
                    f"Sorry, this room is already booked for the selected dates.\n"
                    f"The next available date is {next_available_date}."
                ))
        if self.checkout_date < self.checkin_date:
            raise ValidationError(
                _("Checkout must be greater or equal checkin date"))
        if self.checkin_date and self.checkout_date:
            diffdate = self.checkout_date - self.checkin_date
            qty = diffdate.days
            if diffdate.total_seconds() > 0:
                qty = qty + 1
            self.uom_qty = qty


class RoomBookingInherit(models.Model):
    _inherit = 'room.booking'

    checkin_date = fields.Datetime(string="Check In",
                                   help="Date of Checkin",
                                   default=fields.Datetime.now())
    checkout_date = fields.Datetime(string="Check Out",
                                    help="Date of Checkout",
                                    states={"draft": [("readonly", False)]},
                                    default=fields.Datetime.now() + timedelta(
                                        hours=23, minutes=59, seconds=59))

    @api.model
    def get_month_dates_for_range(self, start_date, end_date):
        start_date = fields.Date.from_string(start_date)
        end_date = fields.Date.from_string(end_date)
        return [(start_date + timedelta(days=i)).strftime('%Y-%m-%d') for i in range((end_date - start_date).days + 1)]

    @api.model
    def get_selected_date_range_rooms(self, date_from, date_to):
        query = f"""
                        WITH date_series AS (
                            SELECT generate_series(
                                '{date_from}'::DATE, 
                                '{date_to}'::DATE, 
                                INTERVAL '1 day'
                            )::DATE AS booking_date
                        ),
                        room_bookings AS (
                            SELECT 
                                r.id AS room_id, 
                                r.name AS room_name, 
                                ds.booking_date,
                                CASE 
                                    WHEN EXISTS (
                                        SELECT 1 
                                            FROM room_booking_line rbl
                                            LEFT JOIN room_booking rb ON rb.id = rbl.booking_id
                                            WHERE rbl.room_id = r.id AND rb.state in ('reserved', 'check_in')
                                        AND ds.booking_date BETWEEN rbl.checkin_date::DATE AND rbl.checkout_date::DATE
                                    ) 
                                    THEN 'Booked' 
                                    ELSE 'Available' 
                                END AS status
                            FROM hotel_room r
                            CROSS JOIN date_series ds
                        )
                        SELECT * FROM room_bookings
                        ORDER BY room_name, booking_date;
                    """
        self.env.cr.execute(query)
        results = self.env.cr.dictfetchall()
        print("results", results)
        return results

    @api.model
    def get_rooms_details_query(self):
        query = """
                WITH date_ranges AS (
                    SELECT 
                        hr.id AS room_id,
                        hr.name AS room_name,
                        rp.name AS customer_name,
                        rb.id AS booking_id,
                        rbl.checkin_date::date AS checkin_date,
                        rbl.checkout_date::date AS checkout_date
                    FROM hotel_room hr
                    LEFT JOIN room_booking_line rbl ON hr.id = rbl.room_id
                    LEFT JOIN room_booking rb ON rb.id = rbl.booking_id  
                        AND rb.state IN ('reserved', 'check_in')
                    LEFT JOIN res_partner rp ON rp.id = rb.partner_id
                ),
                booking_dates AS (
                    SELECT
                        room_id,
                        room_name,
                        customer_name,
                        booking_id,
                        generate_series(
                            COALESCE(checkin_date, CURRENT_DATE), 
                            COALESCE(checkout_date, CURRENT_DATE), 
                            '1 day'::interval
                        )::date AS booking_date
                    FROM 
                        date_ranges
                    WHERE checkin_date IS NOT NULL AND checkout_date IS NOT NULL
                )
                SELECT 
                    hr.id AS room_id,
                    hr.name AS room_name,
                    COALESCE(
                        jsonb_agg(
                            jsonb_build_object(
                                'customer_name', customer_name,
                                'booking_id', booking_id,
                                'booking_dates', booking_dates
                            ) ORDER BY customer_name
                        ) FILTER (WHERE customer_name IS NOT NULL),
                        '[]'::jsonb
                    ) AS customer_bookings
                FROM hotel_room hr
                LEFT JOIN (
                    SELECT 
                        room_id,
                        room_name,
                        customer_name,
                        booking_id,
                        ARRAY_AGG(booking_date ORDER BY booking_date) AS booking_dates
                    FROM 
                        booking_dates
                    GROUP BY 
                        room_id, room_name, customer_name, booking_id
                ) AS aggregated_dates ON hr.id = aggregated_dates.room_id
                GROUP BY 
                    hr.id, hr.name
                ORDER BY 
                    hr.name;
            """
        self.env.cr.execute(query)
        results = self.env.cr.dictfetchall()
        print("results", results)
        return results

    @api.model
    def get_month_dates(self, year, month):
        from calendar import monthrange
        from datetime import date

        days_in_month = monthrange(year, month)[1]
        dates = [
            date(year, month, day).strftime('%Y-%m-%d')
            for day in range(1, days_in_month + 1)
        ]
        return dates