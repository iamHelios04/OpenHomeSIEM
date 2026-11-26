"""Regression checks for common syslog timestamp formats."""

import unittest
from zoneinfo import ZoneInfo

from config import settings
from services.log_parser import parse_syslog


class RFC3164TimestampTests(unittest.TestCase):
    def test_month_names_map_to_their_calendar_month(self) -> None:
        months = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
        for month_number, month_name in enumerate(months, start=1):
            with self.subTest(month=month_name):
                record = parse_syslog(
                    f"<134>{month_name} 15 17:00:00 test-host test-process[1]: sample event",
                    device_type="router",
                )
                self.assertEqual(record.timestamp.month, month_number)
                self.assertEqual(record.timestamp.day, 15)

    def test_valid_31st_day_is_not_dropped(self) -> None:
        for month_name in ("Jan", "Mar", "May", "Jul", "Aug", "Oct", "Dec"):
            with self.subTest(month=month_name):
                record = parse_syslog(
                    f"<134>{month_name} 31 17:00:00 test-host test-process[1]: sample event",
                    device_type="router",
                )
                self.assertEqual(record.timestamp.day, 31)

    def test_rfc3164_without_hostname_keeps_process_and_sender_local_time(self) -> None:
        record = parse_syslog(
            "<30>Nov 21 13:09:33 dnsmasq-dhcp[1018]: DHCPINFORMATION-REQUEST(br0)",
            device_type="router",
        )
        local_timestamp = record.timestamp.astimezone(ZoneInfo(settings.syslog_timezone))
        self.assertEqual(record.host, "unknown")
        self.assertEqual(record.process, "dnsmasq-dhcp")
        self.assertEqual(record.pid, "1018")
        self.assertEqual((local_timestamp.hour, local_timestamp.minute, local_timestamp.second), (13, 9, 33))


if __name__ == "__main__":
    unittest.main()
