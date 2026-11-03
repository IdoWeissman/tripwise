import { createContext, useContext } from 'react';

/**
 * Where floating UI (select menus, popovers) should render.
 * A modal <dialog> sits in the browser's top layer, so menus portalled to <body>
 * would appear *behind* it — dialogs provide themselves as the container instead.
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null);

export const usePortalContainer = () => useContext(PortalContainerContext) ?? undefined;
