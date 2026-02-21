
# python

class Testing():
  def __init__(self) -> None:
    self.name = 'Joe'

  def greet(self):
    print('Hello, ' + self.name)

test = Testing()
test.greet()

# classes, functions, enums, interfaces, methods, structs

def test():
  print('Hello, World!')

test()

from csv_processor import CSVProcessor, CSVConfig

def run_report(filepath: str):
    config = CSVConfig(delimiter=',', has_header=True)
    processor = CSVProcessor(filepath, config)
    processor.load()

    print(f"Total rows: {processor.row_count}")
    print(f"Columns: {processor.columns}")

    status_counts = processor.aggregate('status')
    for status, count in status_counts.items():
        print(f"  {status}: {count}")

    active = processor.filter_rows('status', 'active')
    if active:
        processor.write('active_records.csv', active)
