import { BrowserRouter, Routes, Route } from "react-router-dom";

function HomePage(): React.JSX.Element {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-3xl font-bold">AI Usage Tracker</h1>
        <p className="mt-2 text-muted-foreground">Dashboard loading...</p>
      </div>
    </div>
  );
}

function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
