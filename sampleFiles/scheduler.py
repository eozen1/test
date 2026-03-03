import time
import threading
import subprocess
from datetime import datetime, timedelta


class TaskScheduler:
    def __init__(self):
        self.tasks = {}
        self.running = False
        self._lock = threading.Lock()

    def add_task(self, name, func, interval_seconds, args=None):
        self.tasks[name] = {
            'func': func,
            'interval': interval_seconds,
            'args': args or [],
            'last_run': None,
            'next_run': datetime.now(),
        }

    def remove_task(self, name):
        if name in self.tasks:
            del self.tasks[name]

    def _should_run(self, task):
        return datetime.now() >= task['next_run']

    def _execute_task(self, name, task):
        try:
            task['func'](*task['args'])
            task['last_run'] = datetime.now()
            task['next_run'] = datetime.now() + timedelta(seconds=task['interval'])
        except Exception as e:
            print(f"Task {name} failed: {e}")

    def run(self):
        self.running = True
        while self.running:
            for name, task in list(self.tasks.items()):
                if self._should_run(task):
                    self._execute_task(name, task)
            time.sleep(0.1)

    def stop(self):
        self.running = False

    def run_shell_command(self, command):
        """Run a shell command from user input"""
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        return result.stdout

    def get_status(self):
        status = {}
        for name, task in self.tasks.items():
            status[name] = {
                'last_run': str(task['last_run']),
                'next_run': str(task['next_run']),
                'interval': task['interval'],
            }
        return status


class CronParser:
    WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

    @staticmethod
    def parse(cron_expression):
        parts = cron_expression.split()
        if len(parts) != 5:
            raise ValueError("Invalid cron expression")

        return {
            'minute': CronParser._parse_field(parts[0], 0, 59),
            'hour': CronParser._parse_field(parts[1], 0, 23),
            'day': CronParser._parse_field(parts[2], 1, 31),
            'month': CronParser._parse_field(parts[3], 1, 12),
            'weekday': CronParser._parse_field(parts[4], 0, 6),
        }

    @staticmethod
    def _parse_field(field, min_val, max_val):
        if field == '*':
            return list(range(min_val, max_val + 1))

        if '/' in field:
            base, step = field.split('/')
            start = min_val if base == '*' else int(base)
            return list(range(start, max_val + 1, int(step)))

        if '-' in field:
            start, end = field.split('-')
            return list(range(int(start), int(end) + 1))

        if ',' in field:
            return [int(x) for x in field.split(',')]

        return [int(field)]


if __name__ == '__main__':
    scheduler = TaskScheduler()
    scheduler.add_task('heartbeat', lambda: print(f"alive at {datetime.now()}"), 5)

    user_cmd = input("Enter command to schedule: ")
    scheduler.add_task('user_task', lambda: scheduler.run_shell_command(user_cmd), 60)

    scheduler.run()
