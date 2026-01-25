
// javascript

class Testing {
  constructor() {
    this.name = 'Joe';
  }

  greet() {
    console.log(`Hello ${this.name}`);
  }
}

const test = new Testing();
test.greet();

// classes, functions, enums, interfaces, methods, structs

function greet(name) {
  console.log(`Hello ${name}`);
}

greet('Joe');

// functions, methods

const greet = (name) => {
  console.log(`Hello ${name}`);
}

greet('Joe');

// Array utility functions
const filterEvenNumbers = (numbers) => {
  return numbers.filter(num => num % 2 === 0);
}

const mapSquare = (numbers) => {
  return numbers.map(num => num * num);
}

// Async utility function
// Bug: No error handling, promise can reject
const fetchUserData = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }
  // Bug: No try/catch around async operation
  const response = await fetch(`https://api.example.com/users/${userId}`);
  const data = response.json(); // Bug: Missing await
  return data;
}

// Object manipulation
const mergeObjects = (obj1, obj2) => {
  return { ...obj1, ...obj2 };
}

// Bug: SQL Injection vulnerability
const getUserByName = (username) => {
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  return query; // Vulnerable to SQL injection!
}

// Bug: Memory leak - event listener not cleaned up
const setupEventListener = () => {
  const button = document.getElementById('myButton');
  button.addEventListener('click', () => {
    console.log('Clicked!');
  });
  // Bug: No cleanup/removal of event listener
}

// Bug: Race condition
let counter = 0;
const incrementCounter = async () => {
  const current = counter;
  await new Promise(resolve => setTimeout(resolve, 10));
  counter = current + 1; // Bug: Race condition if called concurrently
}

// Bug: Incorrect array modification
const removeItem = (arr, item) => {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === item) {
      arr.splice(i, 1); // Bug: Doesn't decrement i, skips next element
    }
  }
  return arr;
}
