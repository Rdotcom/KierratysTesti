// A deletion invalidates work that began earlier, including late network replies.
// No persistent identifier or user data is held here.
let generation = 0;
export const localDataGeneration = () => generation;
export const invalidateLocalDataWork = () => {
  generation++;
};
