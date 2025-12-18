<template>
    <Transition name="modal-fade">
        <div v-if="visible" class="modal-overlay" @click.self="onOverlayClick">
            <div class="modal-content">
                <div class="spinner"></div>
                <div class="loading-text">{{ message }}</div>
            </div>
        </div>
    </Transition>
</template>

<script setup lang="ts">
defineProps<{
    visible: boolean
    message?: string
}>()

const emit = defineEmits<{
    close: []
}>()

function onOverlayClick() {
    // Optional: allow closing by clicking overlay
    // emit('close')
}
</script>

<style scoped lang="less">
.modal-fade-enter-active,
.modal-fade-leave-active {
     transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
     opacity: 0;
}

.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.modal-content {
    background: rgba(20, 20, 30, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 40px 60px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.spinner {
    width: 50px;
    height: 50px;
    border: 4px solid rgba(255, 255, 255, 0.1);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.loading-text {
    color: white;
    font-size: 1.1rem;
    font-weight: 500;
    letter-spacing: 0.5px;
}
</style>
