const hello = () => {
    console.log('hello');
}

hello();

// classes, functions, enums, interfaces, methods, structs

class Person {
    name: string;
    age: number;
    email: string;

    constructor(name: string, age: number, email: string) {
        this.name = name;
        this.age = age;
        this.email = email;
    }

    getDisplayName(): string {
        return `${this.name} (${this.age})`;
    }

    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            age: this.age,
            email: this.email
        };
    }
}

const person = new Person('Todd', 27, 'todd@example.com');

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
