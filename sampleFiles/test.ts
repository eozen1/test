const hello = () => {
    console.log('hello');
}

hello();

// classes, functions, enums, interfaces, methods, structs

class Person {
    private name: string;
    private age: number;

    constructor(name: string, age: number) {
        this.name = name;
        this.age = age;
    }

    getName(): string {
        return this.name;
    }

    getAge(): number {
        return this.age;
    }

    celebrateBirthday(): void {
        this.age++;
        console.log(`Happy birthday ${this.name}! You are now ${this.age} years old.`);
    }
}

const person = new Person('Alice', 30);

function add(a: number, b: number): number {
    return a + b;
}

const sum = add(2, 3);

enum Color {
    Red,
    Green,
    Blue
}

const color = Color.Red;

interface Person {
    name: string;
    age: number;
}

const person2: Person = {
    name: 'Todd',
    age: 27
}

const func_add = (a: number, b: number): number => {
    return a + b;
}

const sum2 = func_add(2, 3);

// Utility function for array operations
// Bug: Missing null check, will crash if numbers is null/undefined
const calculateAverage = (numbers: number[]): number => {
    const sum = numbers.reduce((acc, num) => acc + num, 0);
    return sum / numbers.length; // Bug: Division by zero if array is empty
}

// Generic utility type
type Result<T, E = Error> =
    | { success: true; value: T }
    | { success: false; error: E };

const divideNumbers = (a: number, b: number): Result<number> => {
    if (b === 0) {
        return { success: false, error: new Error('Division by zero') };
    }
    return { success: true, value: a / b };
}

// Bug: Infinite loop
const findPrimes = (max: number): number[] => {
    const primes: number[] = [];
    let num = 2;
    while (num < max) {
        let isPrime = true;
        for (let i = 2; i < num; i++) {
            if (num % i === 0) {
                isPrime = false;
                break;
            }
        }
        if (isPrime) {
            primes.push(num);
        }
        // Bug: Forgot to increment num, infinite loop!
    }
    return primes;
}

// Bug: Type coercion issue
const compareValues = (a: any, b: any): boolean => {
    return a == b; // Bug: Using == instead of ===
}
