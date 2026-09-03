<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Manager -> agent, the other direction from messages_agent_maintenance
        // (agent -> Manager): a short text-only nudge on a ticket the agent is
        // already working, e.g. once it's "en retard". No photo/audio -- unlike
        // messages_agent_maintenance, a reminder needs nothing but words.
        Schema::create('ticket_maintenance_rappels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_maintenance_id')->constrained('tickets_maintenance')->cascadeOnDelete();
            $table->foreignId('manager_id')->nullable()->constrained('utilisateurs')->nullOnDelete();
            $table->text('message');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ticket_maintenance_rappels');
    }
};
