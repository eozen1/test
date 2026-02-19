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

// Utility: deep clone an object
function deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => deepClone(item)) as T;
    const cloned = {} as T;
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            (cloned as any)[key] = deepClone((obj as any)[key]);
        }
    }
    return cloned;
}

const original = { name: 'Alice', scores: [90, 85, 92] };
const copy = deepClone(original);
