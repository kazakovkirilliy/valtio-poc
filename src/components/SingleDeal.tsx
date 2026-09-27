import { DealColumn } from "./DealColumn.tsx";
import { ProductColumn } from "./ProductColumn.tsx";
import { useDealStoreSnapshot } from "../contexts/DealStoreProvider.tsx";

export const SingleDeal = () => {
  const snap = useDealStoreSnapshot();

  return (
    <>
      <section className="deal">
        <div>
          <button
            className="button"
            onClick={() => {
              snap.actions.addNewProduct();
            }}
          >
            Add New Product
          </button>
        </div>

        <div className="columnsContainer">
          <DealColumn />
          {Object.keys(snap.products).map((productId) => (
            <ProductColumn key={productId} productId={productId} />
          ))}
        </div>
      </section>
    </>
  );
};
