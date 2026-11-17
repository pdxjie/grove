use crate::model::{Commit, GraphRow};

/// Assigns each commit to a lane and records which lanes pass through each row.
///
/// `commits` must be in topological order (newest first), as produced by
/// `git log --topo-order`.
pub fn layout(commits: &[Commit]) -> Vec<GraphRow> {
    let mut active: Vec<Option<String>> = Vec::new();
    let mut rows = Vec::with_capacity(commits.len());

    for c in commits {
        let lane = match active
            .iter()
            .position(|l| l.as_deref() == Some(c.sha.as_str()))
        {
            Some(i) => i,
            None => first_free(&mut active),
        };
        if lane < active.len() {
            active[lane] = None;
        }

        let mut parent_lanes: Vec<usize> = Vec::new();
        for (idx, p) in c.parents.iter().enumerate() {
            let existing = active
                .iter()
                .position(|l| l.as_deref() == Some(p.as_str()));
            let target = match (existing, idx) {
                (Some(i), _) => i,
                (None, 0) => lane,
                (None, _) => first_free(&mut active),
            };
            ensure(&mut active, target);
            active[target] = Some(p.clone());
            parent_lanes.push(target);
        }

        let mut lines: Vec<usize> = active
            .iter()
            .enumerate()
            .filter(|(i, l)| l.is_some() && *i != lane)
            .map(|(i, _)| i)
            .collect();
        if parent_lanes.first() == Some(&lane) {
            lines.push(lane);
        }
        lines.sort_unstable();
        lines.dedup();

        let max_lane = active
            .iter()
            .rposition(|l| l.is_some())
            .map(|i| i + 1)
            .unwrap_or(0)
            .max(lane + 1);

        rows.push(GraphRow {
            sha: c.sha.clone(),
            lane,
            lanes: max_lane,
            lines,
            parent_lanes,
            merge: c.parents.len() > 1,
        });

        while active.last().map(|l| l.is_none()).unwrap_or(false) {
            active.pop();
        }
    }

    rows
}

fn first_free(active: &mut Vec<Option<String>>) -> usize {
    if let Some(i) = active.iter().position(|l| l.is_none()) {
        return i;
    }
    active.push(None);
    active.len() - 1
}

fn ensure(v: &mut Vec<Option<String>>, i: usize) {
    while v.len() <= i {
        v.push(None);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn commit(sha: &str, parents: &[&str]) -> Commit {
        Commit {
            sha: sha.into(),
            parents: parents.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        }
    }

    #[test]
    fn linear_history_is_one_lane() {
        let log = vec![
            commit("c", &["b"]),
            commit("b", &["a"]),
            commit("a", &[]),
        ];
        let rows = layout(&log);
        assert!(rows.iter().all(|r| r.lane == 0));
        assert_eq!(rows[0].parent_lanes, vec![0]);
        assert!(rows[2].parent_lanes.is_empty());
    }

    #[test]
    fn merge_uses_second_lane_then_merges_back() {
        let log = vec![
            commit("m", &["a", "f1"]),
            commit("a", &["base"]),
            commit("f1", &["base"]),
            commit("base", &[]),
        ];
        let rows = layout(&log);
        assert_eq!(rows[0].lane, 0);
        assert_eq!(rows[0].parent_lanes, vec![0, 1]);
        assert_eq!(rows[1].lane, 0);
        assert_eq!(rows[2].lane, 1);
        assert_eq!(rows[3].lane, 0);
        assert!(rows[2].merge == false);
    }
}
