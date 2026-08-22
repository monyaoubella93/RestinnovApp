FROM php:8.4-fpm

# System dependencies + PHP extensions Laravel needs.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl libpng-dev libonig-dev libxml2-dev zip unzip libzip-dev libsqlite3-dev \
    && docker-php-ext-install pdo_mysql pdo_sqlite mbstring exif pcntl bcmath gd zip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

COPY docker/php/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

COPY docker/php/uploads.ini /usr/local/etc/php/conf.d/uploads.ini

# The application code is provided at runtime via the bind mount declared
# in docker-compose.yml (see the "app" service). Nothing is COPY'd here:
# that would only get shadowed by the mount, and would risk baking .env
# secrets into the image layer.

EXPOSE 9000

ENTRYPOINT ["entrypoint.sh"]
CMD ["php-fpm"]
