export function isTouchClick(event, coarsePointer = () => matchMedia('(hover: none) and (pointer: coarse)').matches) {
    if (event.detail === 0) return false; // Keyboard and assistive activation confirm immediately.
    if (event.pointerType) return event.pointerType === 'touch' || event.pointerType === 'pen';
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
