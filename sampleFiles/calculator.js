// Mediocre Code: Calculator with some issues

class Calculator {
    constructor() {
        this.result = 0;
        this.history = [];
    }

    // Missing input validation
    add(a, b) {
        this.result = a + b;
        this.history.push(a + b);
        return this.result;
    }

    // Inconsistent parameter handling
    subtract(numbers) {
        if (numbers.length == 2) {  // Using == instead of ===
            this.result = numbers[0] - numbers[1];
        }
        return this.result;
    }

    // Magic number without explanation
    multiply(x, y) {
        var result = x * y;  // Using var instead of const/let
        if (result > 1000000) {
            result = 1000000;  // Arbitrary cap
        }
        this.result = result;
        return this.result;
    }

    // Inefficient implementation
    divide(a, b) {
        // No check for division by zero
        let temp = a;
        let count = 0;
        while (temp >= b) {
            temp = temp - b;
            count++;
        }
        this.result = count;
        return this.result;
    }

    // Poorly named function
    doThing() {
        return this.result * 2;
    }

    getHistory() {
        // Returns mutable array reference
        return this.history;
    }
}

// Global variable pollution
var calc = new Calculator();
console.log(calc.add(5, 3));
