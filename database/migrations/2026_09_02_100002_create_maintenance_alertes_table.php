<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Persisted so the Manager notification bell (otherwise entirely
     * computed live from current data, see NotificationController) can
     * carry one-off events ("l'agent a commencé") and the daily
     * retard-check job's "already notified today" dedup, neither of which
     * a live query can express.
     */
    public function up(): void
    {
        Schema::create('maintenance_alertes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_maintenance_id')->constrained('tickets_maintenance')->cascadeOnDelete();
            $table->string('niveau');
            $table->string('message');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('maintenance_alertes');
    }
};
