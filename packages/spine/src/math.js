// The angle constants of the Spine 3.8 runtimes (spine-ts and spine-csharp MathUtils, docs/spec/spine.md 骨骼-7): π as
// 3.1415927, with the degree and radian factors made from it. The runtimes use them for bones' and constraints' angles
// and for bringing an angle into [−π, π]; with Math.PI there instead, an angle that lands on ±π (a 180° shear under a
// −360° offset, say) turns a whole turn the other way. Region attachments and noScale's quarter turn use Math.PI, as
// the runtimes do.

/** The runtimes' π. */
export const PI = 3.1415927;
/** Two of it. */
export const PI2 = PI * 2;
/** Degrees to radians. */
export const DEG_RAD = PI / 180;
/** Radians to degrees. */
export const RAD_DEG = 180 / PI;

/** An angle in radians brought into [−π, π] by one turn, as the runtimes do. @param {number} r */
export const wrapRad = (r) => (r > PI ? r - PI2 : r < -PI ? r + PI2 : r);
