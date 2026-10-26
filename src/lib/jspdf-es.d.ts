// O "exports" do jspdf só tem as condições "node" e "browser"; o build do
// servidor (workerd) não acha nenhuma das duas. Importamos o build ES direto
// — o relatório só roda no navegador mesmo.
declare module "jspdf/dist/jspdf.es.min.js" {
  export * from "jspdf";
}
