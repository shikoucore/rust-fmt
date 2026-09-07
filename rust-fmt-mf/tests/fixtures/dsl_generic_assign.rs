lazy_static! {
    static ref NAMES: Vec<String> = Vec::new();
    static ref SIZES: Vec<u8> = Vec::new();
}

macro_rules! alias {
    ($name:ident) => {
        pub type $name<T> = Vec<T>;
    };
}

static LOOKUP: Option<Vec<String>> = None;

fn at_least(a: u32, b: u32) -> bool {
    a >= b
}

fn halve(mut a: u32) -> u32 {
    a >>= 1;
    a
}
