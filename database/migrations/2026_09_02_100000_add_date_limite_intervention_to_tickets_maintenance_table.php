<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The deadline the Manager sets when assigning a ticket -- optional,
     * set alongside the agent on the assigner() form. Powers the "En
     * retard" badge and the daily retard-alert job, both of which treat a
     * null value as "no deadline was set, never late".
     */
    public function up(): void
    {
        Schema::table('tickets_maintenance', function (Blueprint $table) {
            $table->date('date_limite_intervention')->nullable()->after('agent_id');
        });
    }

    public function down(): void
    {
        Schema::table('tickets_maintenance', function (Blueprint $table) {
            $table->dropColumn('date_limite_intervention');
        });
    }
};
