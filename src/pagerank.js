// PageRank over placement edges, ported from frontend/pageRank.js.
// Each edge [from, to] links a professor's current university to the university of
// one of their degrees. Iteration order (and so floating-point results) follows the
// order schools first appear in `edges`.

export function pageRank(edges, { iterations = 30, damping = 0.85, tolerance = 0.00001 } = {}) {
    const outgoing = new Map();
    for (const [from, to] of edges) {
        if (from === undefined || to === undefined) continue;
        if (!outgoing.has(from)) outgoing.set(from, []);
        if (!outgoing.has(to)) outgoing.set(to, []);
        outgoing.get(from).push(to);
    }
    const nodes = [...outgoing.keys()];
    const n = nodes.length;
    const dangling = nodes.filter(node => outgoing.get(node).length === 0);
    const base = 1 / n;
    // rounded so damping 0.85 gives exactly 0.15, not 0.15000000000000002
    const teleport = Math.round((1 - damping) * 1e12) / 1e12;

    let current = new Map(nodes.map(node => [node, base]));
    for (let iter = 0; iter < iterations; iter++) {
        const last = current;
        current = new Map(nodes.map(node => [node, 0.0]));
        const danglingTotal = dangling.map(node => last.get(node)).reduce((a, b) => a + b, 0);
        for (const node of nodes) {
            const targets = outgoing.get(node);
            for (const to of targets) {
                current.set(to, current.get(to) + damping * last.get(node) * (1.0 / targets.length));
            }
            current.set(node, current.get(node) + (damping * danglingTotal * base + teleport * base));
        }
        let diff = 0;
        for (const node of nodes) diff += Math.abs(current.get(node) - last.get(node));
        if (diff < tolerance) break;
    }
    return current;
}
