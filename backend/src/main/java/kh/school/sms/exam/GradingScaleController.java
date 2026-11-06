package kh.school.sms.exam;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/v1/grading-scales")
public class GradingScaleController {
    public record BandItem(@NotNull BigDecimal minPercent, @NotBlank @Size(max = 50) String labelKm, @NotBlank @Size(max = 5) String letter) {}
    public record ScaleRequest(@NotBlank @Size(max = 100) String nameKm, @NotNull BigDecimal passPercent, @NotNull List<@Valid BandItem> bands) {}
    public record ScaleUpdateRequest(@NotBlank @Size(max = 100) String nameKm, @NotNull BigDecimal passPercent, @NotNull List<@Valid BandItem> bands, long version) {}

    private final GradingScaleService scales;

    public GradingScaleController(GradingScaleService scales) { this.scales = scales; }

    private static GradingScaleService.Input input(String name, BigDecimal pass, List<BandItem> bands) {
        return new GradingScaleService.Input(name, pass, bands.stream().map(b -> new GradingScaleService.Band(b.minPercent(), b.labelKm(), b.letter())).toList());
    }

    @GetMapping
    public List<GradingScaleService.Scale> list() { return scales.list(); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GradingScaleService.Scale create(@Valid @RequestBody ScaleRequest r) { return scales.create(input(r.nameKm(), r.passPercent(), r.bands())); }

    @PutMapping("/{id}")
    public GradingScaleService.Scale update(@PathVariable long id, @Valid @RequestBody ScaleUpdateRequest r) {
        return scales.update(id, input(r.nameKm(), r.passPercent(), r.bands()), r.version());
    }

    @PostMapping("/{id}/set-default")
    public GradingScaleService.Scale setDefault(@PathVariable long id) { return scales.setDefault(id); }
}
