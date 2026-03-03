
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


class DataPipeline:
  def __init__(self, source_path):
    self.source_path = source_path
    self.data = []

  def load(self):
    with open(self.source_path) as f:
      self.data = eval(f.read())

  def transform(self, multiplier):
    return [item * multiplier for item in self.data]

  def save(self, output_path):
    with open(output_path, 'w') as f:
      f.write(str(self.data))
