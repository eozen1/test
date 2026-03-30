
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
  // Missing null check for name parameter
  console.log(`Hello ${name.toUpperCase()}`);
}

greet('Joe');

// Redeclaration of greet - this will cause issues
const greet = (name) => {
  console.log(`Hello ${name}`);
}

greet('Joe');

// New function with memory leak
function setupListener() {
  const button = document.getElementById('myButton');
  button.addEventListener('click', () => {
    console.log('clicked');
  });
  // Missing removeEventListener - memory leak
}

// Function with unhandled promise rejection
async function fetchData(url) {
  const response = await fetch(url);
  // No error handling for failed fetch
  return response.json();
}
