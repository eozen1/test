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

trait Pool {
    type Item;
    fn acquire(&mut self) -> Option<Self::Item>;
    fn release(&mut self, item: Self::Item);
    fn size(&self) -> usize;
}

struct ObjectPool<T> {
    available: Vec<T>,
    factory: Box<dyn Fn() -> T>,
    max_size: usize,
}

impl<T> ObjectPool<T> {
    fn new(factory: impl Fn() -> T + 'static, initial_size: usize, max_size: usize) -> Self {
        let mut available = Vec::with_capacity(max_size);
        for _ in 0..initial_size {
            available.push(factory());
        }
        Self {
            available,
            factory: Box::new(factory),
            max_size,
        }
    }
}

impl<T> Pool for ObjectPool<T> {
    type Item = T;

    fn acquire(&mut self) -> Option<T> {
        if let Some(item) = self.available.pop() {
            Some(item)
        } else if self.available.len() < self.max_size {
            Some((self.factory)())
        } else {
            None
        }
    }

    fn release(&mut self, item: T) {
        if self.available.len() < self.max_size {
            self.available.push(item);
        }
    }

    fn size(&self) -> usize {
        self.available.len()
    }
}
