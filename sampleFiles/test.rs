// sample rust file to test the parser

// this is a comment
fn main() {
    println!("Hello, world!");
}

// create classes, functions, enums, interfaces, methods, structs, traits, types to test the parser
struct Person {
    name: String,
    age: u32,
}

impl Person {
    fn new(name: String, age: u32) -> Self {
        Self { name, age }
    }

    fn say_hello(&self) {
        println!("Hello, my name is {} and I am {} years old", self.name, self.age);
    }
}

enum Color {
    Red,
    Green,
    Blue,
}

trait Printable {
    fn print(&self);
}

impl Printable for Color {
    fn print(&self) {
        match self {
            Color::Red => println!("Red"),
            Color::Green => println!("Green"),
            Color::Blue => println!("Blue"),
        }
    }
}

fn add(a: i32, b: i32) -> i32 {
    a + b
}

struct TaskQueue<T> {
    items: Vec<T>,
    capacity: usize,
}

impl<T> TaskQueue<T> {
    fn new(capacity: usize) -> Self {
        Self {
            items: Vec::with_capacity(capacity),
            capacity,
        }
    }

    fn push(&mut self, item: T) -> Result<(), &str> {
        if self.items.len() >= self.capacity {
            return Err("Queue is full");
        }
        self.items.push(item);
        Ok(())
    }

    fn pop(&mut self) -> Option<T> {
        if self.items.is_empty() {
            None
        } else {
            Some(self.items.remove(0))
        }
    }

    fn len(&self) -> usize {
        self.items.len()
    }

    fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    fn peek(&self) -> Option<&T> {
        self.items.first()
    }

    fn drain(&mut self) -> Vec<T> {
        std::mem::take(&mut self.items)
    }
}
