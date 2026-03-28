
# python

class Testing():
  def __init__(self, name: str = 'Joe', verbose: bool = False) -> None:
    self.name = name
    self.verbose = verbose
    self._history: list[str] = []

  def greet(self):
    msg = 'Hello, ' + self.name
    self._history.append(msg)
    print(msg)

  def get_history(self) -> list[str]:
    return list(self._history)

  def reset(self):
    self._history.clear()
    if self.verbose:
      print(f'History cleared for {self.name}')

test = Testing()
test.greet()

# classes, functions, enums, interfaces, methods, structs

def test():
  print('Hello, World!')

test()
