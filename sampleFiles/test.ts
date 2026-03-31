import { validateConfig } from './config-validator'

const hello = () => {
    console.log('hello');
}

hello();

const config = validateConfig({
    databaseUrl: 'postgresql://localhost:5432/mydb',
    port: 8080,
})

console.log('Config loaded:', config);

// classes, functions, enums, interfaces, methods, structs

class Person {

}

const person = new Person();

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
