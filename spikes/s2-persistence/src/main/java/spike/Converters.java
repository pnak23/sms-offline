package spike;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/** Explicit converters are mandatory: the SQLite driver's default date mapping is time-zone-shifted epoch ms. */
public final class Converters {
    private Converters() {}
}

@Converter
class IsoDateConverter implements AttributeConverter<LocalDate, String> {
    @Override public String convertToDatabaseColumn(LocalDate d) { return d == null ? null : d.toString(); }
    @Override public LocalDate convertToEntityAttribute(String s) { return s == null ? null : LocalDate.parse(s); }
}

@Converter
class IsoInstantConverter implements AttributeConverter<Instant, String> {
    @Override public String convertToDatabaseColumn(Instant i) { return i == null ? null : i.toString(); }
    @Override public Instant convertToEntityAttribute(String s) { return s == null ? null : Instant.parse(s); }
}

/** Two-decimal BigDecimal stored as a scaled integer (7.25 -> 725). */
@Converter
class ScaledDecimalConverter implements AttributeConverter<BigDecimal, Long> {
    @Override public Long convertToDatabaseColumn(BigDecimal d) { return d == null ? null : d.movePointRight(2).longValueExact(); }
    @Override public BigDecimal convertToEntityAttribute(Long l) { return l == null ? null : BigDecimal.valueOf(l, 2); }
}

@Converter
class BooleanIntConverter implements AttributeConverter<Boolean, Integer> {
    @Override public Integer convertToDatabaseColumn(Boolean b) { return b == null ? null : (b ? 1 : 0); }
    @Override public Boolean convertToEntityAttribute(Integer i) { return i == null ? null : i != 0; }
}
