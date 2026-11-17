//! Grove core: git operations, parsing and graph layout. No Tauri dependencies.
pub mod error;
pub mod git;
pub mod graph;
pub mod model;

pub use error::{Error, Result};
pub use model::*;
