
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

def memoize(func):
  cache = {}
  def wrapper(*args):
    if args not in cache:
      cache[args] = func(*args)
    return cache[args]
  return wrapper

@memoize
def fibonacci(n):
  if n < 2:
    return n
  return fibonacci(n - 1) + fibonacci(n - 2)

test()
print(fibonacci(30))
