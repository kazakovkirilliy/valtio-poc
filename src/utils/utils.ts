
export const noop = () => {};


export const uuid = ()=>crypto.randomUUID().toString();


export const getValueByPath = (target:object, path: string): unknown=>{

    console.log(path.split('.'),'\path.split(\'.\')')
    return path.split('.').reduce((currentTarget,part)=>{
        // @ts-expect-error YOLO
        return currentTarget[part];
    },target);

}