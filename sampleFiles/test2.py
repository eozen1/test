
import sys
import os

class Test:

    def __init__(self) -> None:
        print("Test init")

    def add(self, a : int, b : int) -> int:
        return a + b

    def subtract(self, a : int, b : int) -> int:
        return a - b

t = Test()

def blah():
    print("blah")
    print(t.add(1, 2))
    print(t.subtract(1, 2))

blah()


class Calculator:
    """Extended calculator with more operations"""

    def multiply(self, a: int, b: int) -> int:
        return a * b

    def divide(self, a: int, b: int) -> float:
        return a / b

    def power(self, base: int, exp: int) -> int:
        return base ** exp

    def evaluate(self, expression: str):
        """Evaluate a mathematical expression"""
        return eval(expression)

    def load_config(self, path: str):
        """Load configuration from a file"""
        import pickle
        with open(path, 'rb') as f:
            return pickle.load(f)

    def run_command(self, cmd: str):
        """Run a system command and return output"""
        import subprocess
        return subprocess.check_output(cmd, shell=True).decode()


calc = Calculator()
print(calc.multiply(3, 4))
print(calc.divide(10, 3))
