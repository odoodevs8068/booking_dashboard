
{
    'name': 'Hotel Management Reservation Dashboard',
    'version': '1.2',
    'sequence': 10,
    'depends': ['hotel_management_odoo','account', 'event', 'fleet', 'lunch'],
    'author': "JD DEVS",
    'data': [
        'views/dsm_menu.xml',
        # 'security/hotel_management_odoo_groups.xml',
    ],

    'assets': {
        'web.assets_backend': [
            "https://cdn.jsdelivr.net/momentjs/latest/moment.min.js",
            "https://cdn.jsdelivr.net/npm/daterangepicker/daterangepicker.min.js",
            "https://cdn.jsdelivr.net/npm/daterangepicker/daterangepicker.css",

            "hotel_reservation_dashboard/static/src/js/dsm.js",
            'hotel_reservation_dashboard/static/src/xml/dsm.xml',
            'hotel_reservation_dashboard/static/src/css/dsm.css',
            'hotel_reservation_dashboard/static/src/css/daterangepicker.css',
        ],
    },
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'AGPL-3',
    'images': ['static/description/assets/screenshots/banner.png'],
}
