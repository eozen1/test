// Erroneous Code: Memory and ownership issues

use std::collections::HashMap;

struct Cache {
    data: HashMap<String, String>,
}

impl Cache {
    fn new() -> Cache {
        Cache {
            data: HashMap::new(),
        }
    }

    // Bug: Borrowing issue - tries to return reference to temporary
    fn get_or_default(&self, key: &str) -> &String {
        if self.data.contains_key(key) {
            &self.data[key]
        } else {
            &String::from("default")  // Bug: Returns reference to temporary value
        }
    }

    // Bug: Moves value out of borrowed content
    fn take_value(&self, key: &str) -> String {
        self.data.remove(key).unwrap()  // Bug: remove requires &mut self
    }

    // Bug: Use after move
    fn duplicate_insert(&mut self, key: String, value: String) {
        self.data.insert(key.clone(), value);
        self.data.insert(key, value);  // Bug: value was already moved
    }
}

// Bug: Missing lifetime annotation
struct DataHolder {
    text: &str,  // Bug: Missing lifetime parameter
}

// Bug: Incorrect iterator usage
fn process_items(items: Vec<i32>) -> Vec<i32> {
    let mut result = Vec::new();
    for item in items {
        result.push(item * 2);
    }
    items  // Bug: items was moved in the loop
}

// Bug: Dangling pointer
fn create_string_ref() -> &'static str {
    let s = String::from("hello");
    &s  // Bug: s will be dropped
}

fn main() {
    let mut cache = Cache::new();
    cache.data.insert(String::from("key1"), String::from("value1"));

    // This will cause compilation errors
    let val = cache.get_or_default("key1");
    println!("{}", val);
}
