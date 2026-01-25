
# python

class Testing():
  def __init__(self, name='Joe') -> None:
    self.name = name
    self.greeting_count = 0

  def greet(self):
    print('Hello, ' + self.name)
    self.greeting_count += 1

  def farewell(self):
    print(f'Goodbye, {self.name}! You were greeted {self.greeting_count} times.')

  def update_name(self, new_name):
    # Bug: Using try/catch when style guide says not to
    try:
      if not new_name or not isinstance(new_name, str):
        raise ValueError('Name must be a non-empty string')
      old_name = self.name
      self.name = new_name
      return f'Name updated from {old_name} to {new_name}'
    except ValueError:
      return 'Invalid name'

test = Testing()
test.greet()

# classes, functions, enums, interfaces, methods, structs

def test():
  print('Hello, World!')

# Bug: Undefined variable
def calculate_total(items):
  total = 0
  for item in items:
    total += item.price
  # Bug: Using undefined variable 'tax'
  return total * tax

# Bug: Division by zero possibility
def divide(a, b):
  return a / b

test()
