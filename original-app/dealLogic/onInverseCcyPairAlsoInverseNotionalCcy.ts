export const onInverseCcyPairAlsoInverseNotionalCcy = (
  prevState,
  changes: ChangesAsDotPaths,
) => {
  const currentStateWithChangesApplies = applyChangesToState(
    prevState,
    changes,
  );

  const isSelectedCcyChange = changes.some([path,value,meta]=>path.includes("selectedCcy", meta.isUserChange));


  if(isSelectedCcyChange &&currentStateWithChangesApplies.selectedCcy.isInverse){
    return [
      'notionalCcy',
      currentStateWithChangesApplies.selectedCcy.inverseCcy
    ]
  }


};
