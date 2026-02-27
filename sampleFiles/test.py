
# python

class Testing():
  def __init__(self) -> None:
    self.name = 'Joe'

  def greet(self):
    print('Hello, ' + self.name)

  def set_name(self, name: str):
    self.name = name
    return self

  def to_dict(self):
    return {'name': self.name}

test = Testing()
test.greet()

# classes, functions, enums, interfaces, methods, structs

def test():
  print('Hello, World!')

test()

def fibonacci(n: int) -> list[int]:
  if n <= 0:
    return []
  if n == 1:
    return [0]
  seq = [0, 1]
  for _ in range(2, n):
    seq.append(seq[-1] + seq[-2])
  return seq
