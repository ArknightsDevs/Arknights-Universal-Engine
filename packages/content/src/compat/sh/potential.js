// Stands in for Stronghold's shared/potential.js (兼容-2): the names its operator kits import. A record at a potential is
// the record itself: ours are made at their build's potential already (兼容-3), without Stronghold's potential notes.

/** A record (or a summon's) at a potential: the record itself (see the header). @template T @param {T} rec @returns {T} */
export const atPotential = (rec) => rec;
