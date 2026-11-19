import { createContext } from "react";

/**
 * Na tela de Configurações os cartões viram uma lista de botões que
 * expandem (um título por seção); nas outras telas seguem abertos.
 */
export const CartoesRecolhiveis = createContext(false);
