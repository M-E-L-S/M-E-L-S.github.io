export function isTouchClick(event, pressedPointerType = '', coarsePointer = () => matchMedia('(hover: none) and (pointer: coarse)').matches) {
    if (event.detail === 0) return false; // Keyboard and assistive activation confirm immediately.
    // Safari can report a touch-generated click as "mouse"; prefer the preceding pointerdown.
    const pointerType = pressedPointerType || event.pointerType;
    if (pointerType) return pointerType === 'touch' || pointerType === 'pen';
    return coarsePointer();
}

export class MovePreview {
    constructor() { this.clear(); }
    clear() { this.index = null; this.position = null; }
    sync(position, enabled) {
        if (!enabled || this.position !== position) this.clear();
    }
    confirm(index, position, touch) {
        const confirmed = !touch || this.index === index && this.position === position;
        this.clear();
        if (!confirmed) { this.index = index; this.position = position; }
        return confirmed;
    }
}
