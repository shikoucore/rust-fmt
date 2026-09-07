mod examples;

use std::collections::HashMap;
use std::fmt::Write;

fn main() {
    let x = 1 + 2 * 3;
    println!("Hello, world!");
    if x > 5 {
        println!("x is big");
    } else {
        println!("x is small");
    }
    let arr = [1, 2, 3, 4];
    for item in arr.iter() {
        println!("{}", item);
    }
    let result = add(x, 10);
    println!("Result: {}", result);
    examples::big_mess::terribly_formatted_function(1, 2, 3, 4, 5, 6);
    examples::complex_types::generic_function(42, "hello");
    examples::macro_heavy::use_bad_macros();
    macro_rules! messy {
        ($x:expr) => {
            let y = $x + 1;
            let z = y * 2;
            println!("result: {}", z)
        };
    }
    messy!(5);
    let mut counts: HashMap<&str, usize> = HashMap::new();
    counts.insert("messy", 1);
    println!("{}", summarize(&counts));
}

fn add(a: i32, b: i32) -> i32 {
    a + b
}

pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
}

fn summarize(counts: &HashMap<&str, usize>) -> String {
    let mut names: Vec<&&str> = counts.keys().collect();
    names.sort();
    let mut out = String::new();
    for name in names {
        let _ = write!(out, "{}={};", name, counts[name]);
    }
    out
}
