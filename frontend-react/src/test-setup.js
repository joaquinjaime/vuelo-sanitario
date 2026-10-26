import { configure } from "@testing-library/react";

// Bajo la carga de las ejecuciones completas (varios archivos jsdom en paralelo) 1 s no alcanza para los formularios con autocompletado;
// el tiempo de espera de findBy*/waitFor es sólo un tope: las pruebas que pasan no esperan más.
configure({ asyncUtilTimeout: 10000 });
