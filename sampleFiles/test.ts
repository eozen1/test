const hello = () => {
    console.log('hello');
}

hello();

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

function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
    const groups: Record<string, T[]> = {};
    for (const item of items) {
        const key = keyFn(item);
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    }
    return groups;
}

function retry<T>(fn: () => Promise<T>, attempts: number = 3, delayMs: number = 1000): Promise<T> {
    return fn().catch(err => {
        if (attempts <= 1) throw err;
        return new Promise(resolve => setTimeout(resolve, delayMs))
            .then(() => retry(fn, attempts - 1, delayMs));
    });
}
