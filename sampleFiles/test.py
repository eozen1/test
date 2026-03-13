
# python

class Testing():
  def __init__(self, name: str = 'Joe') -> None:
    self.name = name
    self.history: list[str] = []

  def greet(self):
    msg = f'Hello, {self.name}'
    self.history.append(msg)
    print(msg)

  def get_history(self) -> list[str]:
    return list(self.history)

test = Testing()
test.greet()

# classes, functions, enums, interfaces, methods, structs

def test():
  print('Hello, World!')

test()
