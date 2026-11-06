package kh.school.sms.audit;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The audit trail can be read and appended to, never edited or removed. Structural, so a later change that adds an endpoint or a
 * service method that touches existing rows fails here, not in production.
 */
class AuditReadOnlyTest {
    @Test
    void theViewerOnlyHasGetEndpoints() {
        for (Method m : AuditController.class.getDeclaredMethods()) {
            if (m.isSynthetic()) continue;
            assertThat(m.isAnnotationPresent(PostMapping.class) || m.isAnnotationPresent(PutMapping.class) || m.isAnnotationPresent(DeleteMapping.class)
                    || m.isAnnotationPresent(PatchMapping.class) || m.isAnnotationPresent(RequestMapping.class))
                    .as(m.getName() + " must not be a mutating endpoint").isFalse();
        }
        long gets = Arrays.stream(AuditController.class.getDeclaredMethods()).filter(m -> m.isAnnotationPresent(GetMapping.class)).count();
        assertThat(gets).isEqualTo(2);   // the list and the filter choices
    }

    @Test
    void theOnlyWayToWriteIsToAppend() {
        List<String> publicMethods = Arrays.stream(AuditService.class.getDeclaredMethods())
                .filter(m -> Modifier.isPublic(m.getModifiers())).map(Method::getName).distinct().toList();
        assertThat(publicMethods).as("AuditService offers record(...) and nothing that updates or deletes").containsExactly("record");
    }
}
