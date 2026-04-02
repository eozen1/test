const greet = (name: string = 'world') => {
    console.log(`hello, ${name}`);
}

greet();
greet('Todd');

enum Color {
    Red = 'red',
    Green = 'green',
    Blue = 'blue',
    Yellow = 'yellow',
}

interface Person {
    name: string;
    age: number;
    email?: string;
}

class PersonModel implements Person {
    name: string;
    age: number;
    email?: string;

    constructor(name: string, age: number, email?: string) {
        this.name = name;
        this.age = age;
        this.email = email;
    }

    greet(): string {
        return `Hi, I'm ${this.name} (${this.age})`;
    }
}

function add(a: number, b: number): number {
    return a + b;
}

function multiply(a: number, b: number): number {
    return a * b;
}

const person = new PersonModel('Todd', 27, 'todd@example.com');
console.log(person.greet());

const favoriteColor: Color = Color.Blue;
console.log(`Favorite color: ${favoriteColor}`);
