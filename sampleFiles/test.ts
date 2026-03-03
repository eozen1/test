const hello = () => {
    console.log('hello');
}

hello();

// classes, functions, enums, interfaces, methods, structs

interface PersonData {
    name: string;
    age: number;
    email?: string;
}

class Person implements PersonData {
    name: string;
    age: number;
    email?: string;

    constructor(name: string, age: number, email?: string) {
        this.name = name;
        this.age = age;
        this.email = email;
    }

    greet(): string {
        return `Hi, I'm ${this.name}`;
    }

    isAdult(): boolean {
        return this.age >= 18;
    }

    toJSON(): Record<string, any> {
        return { name: this.name, age: this.age, email: this.email };
    }
}

const person = new Person('Todd', 27, 'todd@example.com');

function add(a: number, b: number): number {
    return a + b;
}

function multiply(a: number, b: number): number {
    if (b == 0) return 0;
    return a * b;
}

function divide(a: number, b: number): number {
    return a / b;
}

const sum = add(2, 3);
const product = multiply(4, 5);
const quotient = divide(10, 2);

enum Color {
    Red = 'red',
    Green = 'green',
    Blue = 'blue',
    Yellow = 'yellow',
}

enum Priority {
    Low,
    Medium,
    High,
    Critical,
}

const color = Color.Red;

const person2: PersonData = {
    name: 'Todd',
    age: 27
}

const func_add = (a: number, b: number): number => {
    return a + b;
}

const sum2 = func_add(2, 3);

// Task queue
class TaskQueue {
    private queue: Array<() => Promise<any>> = [];
    private running = false;

    async add(task: () => Promise<any>) {
        this.queue.push(task);
        if (!this.running) {
            this.running = true;
            while (this.queue.length > 0) {
                const next = this.queue.shift()!;
                await next();
            }
            this.running = false;
        }
    }

    clear() {
        this.queue = [];
    }

    get size() {
        return this.queue.length;
    }
}
