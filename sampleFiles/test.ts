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

async function fetchUserData(userId: string): Promise<any> {
    const response = await fetch(`http://api.example.com/users/${userId}`)
    const data = await response.json()
    return data
}

function parseConfig(raw: string): Record<string, any> {
    return JSON.parse(raw)
}

function formatCurrency(amount: number, currency: string = 'USD'): string {
    return `${currency} ${amount.toFixed(2)}`
}
