import "./App.css";
import {DealColumn} from "./components/DealColumn.tsx";
import {ProductColumn} from "./components/ProductColumn.tsx";
import {useSnapshot} from "valtio/react";
import {dealStore} from "./stores/dealStore.ts";

function App() {
    const snap = useSnapshot(dealStore);
    return (
        <>
            <section>
                <div>
                    <button className="button" onClick={() => {

                        dealStore.actions.addNewProduct()
                    }}>Add New Product
                    </button>
                </div>

                <div className="columnsContainer">
                    <DealColumn/>
                    {Object.keys(snap.products).map((productId) => (
                        <ProductColumn key={productId} productId={productId}/>))}
                </div>
            </section>
        </>
    );
}

export default App;
