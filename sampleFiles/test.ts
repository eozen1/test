import { validateUrl, normalizeApiPath, matchRoute } from './url-validator'

const hello = () => {
    console.log('hello');
}

hello();

// Validate incoming webhook URLs before processing
const webhookUrl = 'https://api.example.com/hooks/receive'
if (validateUrl(webhookUrl)) {
    const normalized = normalizeApiPath(new URL(webhookUrl).pathname)
    const route = matchRoute(webhookUrl, ['/hooks/:action', '/api/v1/:resource'])
    console.log(`Matched route: ${route?.path}, params: ${JSON.stringify(route?.params)}`)
}

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
