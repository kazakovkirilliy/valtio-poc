import "./App.css";
import { DealColumn } from "./components/DealColumn.tsx";
import { ProductColumn } from "./components/ProductColumn.tsx";

function App() {
  return (
    <>
      <section>
        <div className="columnsContainer">
          <DealColumn />
          <ProductColumn />
          <ProductColumn />
          <ProductColumn />
        </div>
      </section>
    </>
  );
}

export default App;
